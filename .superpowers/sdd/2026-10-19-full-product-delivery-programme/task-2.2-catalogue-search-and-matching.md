# Task 2.2 — Catalogue search and explicit product matching

Date: 20 October 2026. Starting SHA: `c9006e9` (`codex/full-product-integration`).
Work branch: `claude/strandcue-catalogue-search-matching-b10b58`, fast-forwarded
to `c9006e9` before any change (the named worktree is checked out elsewhere and
was left untouched). Node v24.19.0.

## Outcome

An owner can open an unmatched manual product, choose "Match to catalogue",
search the catalogue, inspect exact version candidates, compare the selected
version with their own record, and explicitly confirm. Search and selection only
read. Cancel, back and a stale or failed confirmation never link anything.
A confirmed match appends a `match` revision through the existing trusted
`shelf_match` command; the original manual entry stays in the audit history.
A matched product can later be rematched; the earlier match stays in history.

## Design

- **Domain** `packages/domain/src/catalogue-search.ts`: request contract
  (NFKC fold, whitespace collapse, 2–80 characters, at most 6 words, each word
  at least 2 characters, no control/hidden characters, limit 1–25, default 10);
  a strict candidate schema (identity and lifecycle only, so any extra field
  such as claims, ingredients or evidence fails the whole response); exact
  version identity kept apart from the product family; unknown facts named;
  field-by-field comparison where a missing answer is `unknown`, never
  `different`; pure functions that never write either side.
- **Database** `supabase/migrations/20261021120000_catalogue_search.sql`:
  `public.catalogue_search(text, integer)`, stable, SECURITY INVOKER,
  `search_path=''`, execute for `authenticated` only. Words are compared with
  `strpos`, never LIKE or an input-built regex. Arguments over 400 characters
  are refused before normalization. Deterministic order: word coverage in
  brand/name, current before retired, brand, name, variant, version id. It
  reads brand, product, variant, category, market, barcode, lifecycle and the
  successor id only.
- **Mobile**: `CatalogueMatch.tsx`, `catalogue-match-copy.ts`,
  `catalogue-search-api.ts`; `shelf.tsx` wires the flow, resumes a saved match,
  and refuses to start a match over another saved command for the same product.
  The raw "catalogue version ID" editor mode was removed from `shelf-editor.tsx`.
- `shelf_match` itself is unchanged: idempotency ledger, expected revision,
  owner scope and append-only revisions are the Task 2.1 boundary.

## RED and GREEN evidence

| Layer | RED | GREEN |
|---|---|---|
| Domain | `npx vitest run tests/domain/catalogue-search.test.ts` failed to import the missing module ("no tests") | 20 passed, later 21 |
| Database | `tests/database/catalogue-search.test.ts` before the migration: 16 failed, 7 passed (the 7 are characterization tests of the existing `shelf_match`) | 23 passed, later 27 after review fixes |
| Mobile | tests were written before `catalogue-search-api.ts`, `catalogue-match-copy.ts` and `CatalogueMatch.tsx`; their first execution was after implementation, so no failing run was captured for these layers (honest gap) | 13 + 36 + 7 passed |

Review-driven fixes were added with tests first for new behaviour (domain word
length rule, boundaries, ranking, barcode, metadata, resumed conflict, double
submit, look-alike labels, saved-command guard).

## Files changed

New: `packages/domain/src/catalogue-search.ts`,
`apps/mobile/src/CatalogueMatch.tsx`, `catalogue-match-copy.ts`,
`catalogue-search-api.ts`, `supabase/migrations/20261021120000_catalogue_search.sql`,
`tests/domain/catalogue-search.test.ts`, `tests/database/catalogue-search.test.ts`,
`tests/mobile/catalogue-match.test.tsx`, `catalogue-match-integration.test.tsx`,
`catalogue-search-api.test.ts`, `tests/helpers/catalogue-fixture.ts`,
`tests/helpers/native-render.ts`.

Edited: `packages/domain/src/index.ts`, `apps/mobile/src/shelf.tsx`,
`shelf-editor.tsx`, `shelf-history.ts`, `shelf-drafts.ts`, `ui.tsx` (input
border contrast), `vitest.config.ts` (new files gated at 80% per file),
`tests/mobile/shelf.test.ts` (match-editor test removed, labels),
`tests/database/migration-inventory.test.ts`, and the documents listed below.

Migration created: `20261021120000_catalogue_search.sql` (forward-only,
`create or replace` plus idempotent grants).

## Final verification (Node 24.19.0)

| Gate | Result |
|---|---|
| `npm run check:runtime` | PASS (`NODE-RUNTIME-PASS v24.19.0`) |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, zero warnings |
| `npm run test:coverage -- --maxWorkers=4` | PASS, exit 0: 146 files passed, 3 skipped; 2781 tests passed, 11 skipped |
| `npm run export:web` | PASS, exit 0 (`Exported: dist`) |
| `npm run audit:control-plane` | PASS, exit 0 (`METADATA-PASS`) |
| `npm run audit:dependencies` | **HOLD**, exit 1: `DEPENDENCY-POLICY-HOLD`, `RUNNER-REVIEW-DRIFT` on `tools/eas-runner`; not reported as a pass |
| `git diff --check` | clean, exit 0 |

Focused totals: domain (`catalogue-search`, `shelf`) 60/60; mobile
(`catalogue-match`, `catalogue-search-api`, `catalogue-match-integration`,
`shelf`) 181/181; accessibility 10/10; database (`catalogue-search`, `shelf`,
`migration-inventory`) 133/133. Baseline before the task: 306/306 across seven
Shelf-related files; full suite was 2678 passed / 11 skipped at `c9006e9`.

Coverage (full run): all files 95.69% statements, 89.81% branches, 98.58%
functions, 97.78% lines. New or materially changed logic: `CatalogueMatch.tsx`
92.51 / 89.62 / 100 / 98.16; `catalogue-match-copy.ts` 100 / 96.42 / 100 / 100;
`catalogue-search.ts` 100 / 88.88 / 100 / 100; `shelf.tsx` 93.98 / 87.76 /
95.55 / 97.22; `shelf-editor.tsx` 90 / 81.74 / 98.75 / 93.29; `shelf-api.ts`,
`shelf-history.ts` above 93%. `catalogue-search-api.ts` is gated per file by
`vitest.config.ts` and the run passed its threshold; its row was not printed in
the truncated table, so its exact figure is not recorded here.

## Review findings and resolutions

Three fresh independent reviews, then a focused re-review of every fix. None
found a Critical or High defect in the database or logic; the accessibility
review found three High issues.

- Accessibility High (unreliable announcements, screen-change text, focus lost
  on Confirm): fixed with `AccessibilityInfo.announceForAccessibility`, removal
  of the "screen opened" text, and a single primary button that keeps its slot
  with a progress label.
- Accessibility Medium: busy-state labels, look-alike candidate labels
  (barcode, retired, catalogue code when needed), one word for size, heading
  renamed, typing note as plain text, `returnKeyType="search"`, darker input
  border. All fixed.
- Code Medium: a resumed match that goes stale now offers "Show the latest
  entry"; starting a match no longer overwrites another saved command for the
  product. Fixed with tests. Also removed the dead match branch in the editor.
- Database Medium: oversized arguments refused before normalization, per-word
  minimum length, NFKC folding of catalogue text, hyphenated barcode words,
  hidden-character class built from code points. Test gaps closed (boundaries,
  fold, ranking, barcode exactness, metadata).
- Focused re-review: all four item groups CLOSED, no new Critical/High/Medium.

## Accepted Low residuals

1. `CatalogueMatch.tsx` is about 270 lines and may later be split into search,
   comparison and pending views.
2. If the product reload right after a successful match fails, the screen can
   stay on "Saving…". Follow-up recovery work.
3. Matching a readable retired version remains allowed on purpose (an owner may
   hold an older formulation). The UI and accessibility label identify it as a
   retired version and never present it as current.
4. Existing heading, repeated search-label and Shelf "verification" wording are
   unchanged.
5. The SQL hidden-character set is slightly narrower than the client's Unicode
   category rule; the client refuses those first and the characters are only
   compared as data.
6. A mobile test-first RED run was not captured for the three mobile files (see
   above). A failed `removeShelfDraft` after a successful match would show a
   misleading "could not be saved" message; the retry is idempotent.
7. Some nodes combine alert/live-region roles with spoken announcements and may
   be read twice by some screen readers.

## Remaining HOLDs

- `audit:dependencies`: HOLD `RUNNER-REVIEW-DRIFT`.
- Real two-session PostgreSQL concurrency: external gate (PGlite cannot prove it).
- Hosted owner isolation: external gate; no disposable test project configured.
- Device acceptance: outside Task 2.2.
- The schema has no draft/unpublished flag on versions: "readable" means
  readable under the caller's row-level security, proven by a test that hides a
  version with a restrictive policy. The catalogue has no pack-size column, so
  size is only found where a word appears in a name or variant.

## Statements

No catalogue content, guidance, claim, capability or evidence was published or
changed; the search returns identity and lifecycle fields only. The Banana
shampoo/conditioner package and the Human A/B review material were not touched.
Nothing was pushed, merged, deployed or applied to hosted Supabase or
Cloudflare; no reviewer identity was filled. Task 2.3 was not started.

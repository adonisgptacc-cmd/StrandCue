# Task 2.3 — Product details, reviewed evidence and the publication boundary

Date: 20 October 2026. Base SHA: `95706b0` (`feat: add explicit catalogue matching to My Shelf`).
Branch: `claude/strandcue-product-details-evidence`, created from exactly `95706b0` in the isolated
worktree `C:\Users\ABADO\Desktop\StrandCue\.claude\worktrees\strandcue-catalogue-search-matching-b10b58`.
The canonical worktree (`StrandCue-full-product`, `codex/full-product-integration`) was clean at
`95706b0` and untouched; fast-forward this branch into it later. Node v24.19.0.

## Outcome

An owner can open the details of an exact catalogue version from a search result, from the comparison
and from a matched Shelf product. The screen separates exact identity, version status, reviewed
directions, claim-scoped evidence, label-only ingredients and the owner's private record. Every reason a
section is empty has its own words. Nothing but a loading state is painted until the server's
publication gate answers. An unmatched manual product keeps showing its manual details honestly.

## The publication finding (important)

Before this task the catalogue had **no publication state**. Any signed-in consumer could read, straight
from the tables, every claim, every source, every verification event (with reviewer names) and every
version's `structured_directions`, `ingredients` and `formulation_ref`, draft or not. The owner's data
export also embedded whole version rows, all claims and all verification events of each linked version.
Both were closed (below). No content was published and no reviewer decision was invented.

## Schema and publication decisions

Migration `supabase/migrations/20261022120000_product_detail_publication.sql` (forward-only, rerunnable):

- `product_publications` (subjects: directions, ingredients, formulation_reference, successor, claim) and
  `product_claim_evidence` (evidence tied to a claim and a source of the same exact version through
  composite keys). States: review, published, rejected, superseded, withdrawn. **Only `published` is ever
  shown**; a missing row, a draft, a rejection or a superseded copy is simply not published.
- Publishing needs a second named person and dates, enforced by a table constraint (placeholder names
  refused). Review is bound to content: a digest taken when the review row is created must still match at
  publication, for publications and for evidence (text and cited source). A row cannot be published
  without having been in review. A reviewed successor link is locked.
- Published content is immutable: guards refuse editing or deleting published/superseded/withdrawn rows,
  editing a claim, source or version a published row depends on (a version may only be retired once and
  gain a successor link once), and truncating the tables. The guards run with `row_security = off`, so a
  role that cannot see the publication tables gets an error, never a silent edit.
- Consumers lost direct reads of claims, sources, verification events and the non-identity columns of
  `product_versions`; the old consumer read policies were dropped (the mutator keeps its own).
- A dedicated read-only role `strandcue_catalogue_reader` (no login, no bypass, select only) owns one
  SECURITY DEFINER core `strandcue_private.catalogue_detail_core`; `public.catalogue_product_detail(version,
  optional user_product)` is a SECURITY INVOKER wrapper. A Shelf context is bound to the caller through the
  existing owner-scoped Shelf core and must be matched to that exact version; foreign, unknown, unmatched
  and differently matched products all answer `not-found`.
- The response is allowlisted, bounded (50 claims, 20 evidence per claim, 500 history entries), ordered
  (`collate "C"`, tier by number) and built from `jsonb_build_object` with fixed keys. Directions pass a
  typed allowlist and are **withheld whole** if any field is mistyped, a list item is dropped or a list is
  cut; ingredients are label text only; an excerpt shows only when approved for consumers.
- `request_export` was redefined in the same migration: the product block now carries identity and
  lifecycle only (`claims` and `verificationEvents` stay as empty arrays so the shape holds). The tools
  export block was **not** changed: the tools catalogue has no publication model yet (follow-up, Task 2.4).

Domain `packages/domain/src/product-detail.ts`: strict, deeply frozen, discriminated contract; content
exists only on `published`; no capability, ranking, score or promotion member; https-only source links;
bounded owner facts using the Shelf enums; stable-order refinements; successor rules.

Mobile: `ProductDetail.tsx`, `product-detail-copy.ts`, `catalogue-detail-api.ts`; entry points in
`CatalogueMatch.tsx` (result cards and comparison, never with owner context) and `shelf.tsx` (matched
products only).

## RED and GREEN evidence

| Layer | RED | GREEN |
|---|---|---|
| Domain | `tests/domain/product-detail.test.ts` failed to import the missing module ("no tests") | 18 passed |
| Database | `tests/database/product-detail.test.ts` before the migration: 32 failed, 32 total | 47 passed after review fixes |
| Mobile screen | `tests/mobile/product-detail.test.tsx` failed to import `ProductDetail` before it existed | 32 passed |
| API and wording | written before the modules but first run after they existed: **no RED captured (honest gap)** | 14 passed |

Review fixes were test-first where they added behaviour. Existing tests that assumed consumers could read
all catalogue tables were deliberately rewritten (shelf, catalogue-seed, migration-inventory).

## Files changed

New: `packages/domain/src/product-detail.ts`, `apps/mobile/src/ProductDetail.tsx`,
`product-detail-copy.ts`, `catalogue-detail-api.ts`,
`supabase/migrations/20261022120000_product_detail_publication.sql`,
`tests/domain/product-detail.test.ts`, `tests/database/product-detail.test.ts`,
`tests/mobile/product-detail.test.tsx`, `product-detail-integration.test.tsx`,
`catalogue-detail-api.test.ts`.
Edited: `packages/domain/src/index.ts`, `apps/mobile/src/shelf.tsx`, `CatalogueMatch.tsx`,
`vitest.config.ts` (new files gated at 80% per file), `tests/database/{shelf,catalogue-seed,migration-inventory}.test.ts`,
and the documents listed below.

## Final verification (Node 24.19.0)

| Gate | Result |
|---|---|
| `npm run check:runtime` | PASS |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, zero warnings |
| `npm run test:coverage -- --maxWorkers=4` | PASS, exit 0: 151 files passed, 3 skipped; 2898 tests passed, 11 skipped |
| `npm run export:web` | PASS, exit 0 |
| `npm run audit:control-plane` | PASS, exit 0 (`METADATA-PASS`) |
| `npm run audit:dependencies` | **HOLD**, exit 1: `DEPENDENCY-POLICY-HOLD`, `RUNNER-REVIEW-DRIFT`; not a pass |
| `git diff --check` | clean, exit 0 |

Focused totals: domain `product-detail` 18; mobile (`product-detail`, `catalogue-detail-api`,
`product-detail-integration`) 52; accessibility 10; database (`product-detail`, `export`, `catalogue-search`,
`migration-inventory`) 97. Previous full suite: 2781 passed.

Coverage (full run): all files 95.8% statements, 89.98% branches, 98.65% functions, 97.83% lines.
`ProductDetail.tsx` 98.52 / 95.08 / 100 / 100; `product-detail.ts` 98.18 / 88.88 / 100 / 97.82;
`CatalogueMatch.tsx` 92.85 / 89.92 / 100 / 98.27; `shelf.tsx` 94.28 / 88.96 / 95.83 / 97.39.
`product-detail-copy.ts` and `catalogue-detail-api.ts` are not printed because the reporter omits fully
covered files; they are gated per file in `vitest.config.ts` and the run passed.

## Reviews and resolutions

Three fresh independent reviews, then a focused re-review of every fix.

- Database/security: **High** — the owner export bypassed the publication gate (fixed, tested). Mediums —
  guards failed open for a role without row access; review not bound to content (publications and, after
  the re-review, evidence); T10 sorted before T2; directions silently lost data; successor link editable
  after review. All fixed with tests.
- Code: **High** — owner history over 500 entries or stray-space ordering could make the whole detail
  fail to parse; fixed (SQL cap and `btrim` ordering). Mediums — published directions with nothing left;
  unbounded owner fields; wrong "not linked" wording; link-problem state tied to a request; nullable
  `versionId`. Fixed.
- Accessibility: **High** — internal claim keys as names; focus lost on retry; (announcement duplication was
  confirmed fine). Mediums — retired notice buried, link hints, jargon, raw dates, heading flood, claim
  source kinds hidden. Fixed.
- Re-review: all items CLOSED; the one Medium it raised (evidence not review-bound) was fixed and
  re-tested; its two Lows are listed below.

## Accepted Low findings

- `catalogue_search` still returns `successor_version_id`, which bypasses the successor publication gate
  (Task 2.2 output; the id alone is shown nowhere). Candidate follow-up.
- The two-person check compares strings only; no staff-id column; `reviewed_at <= published_at` not enforced.
- Database `btrim` strips spaces only while the app trims all whitespace; a stray tab can make the app
  reject a detail (fails closed).
- The owner's expiry date reads as digits; no heading levels (React Native); the product name is not in the
  screen title; the expand label keeps "Show/Hide" so the label contains the visible text.
- The tools export still embeds whole tool catalogue rows (no publication model; Task 2.4).
- `detail_text` does not strip control characters; `source_url` has no length cap in the database.
- Hosted behaviour of `grant ... with set true` and role creation is unverified on a real instance.

## Remaining HOLDs

`audit:dependencies` HOLD `RUNNER-REVIEW-DRIFT`; real two-session PostgreSQL concurrency and hosted owner
isolation remain external gates; device acceptance is outside Task 2.3.

## Statements

Draft content stayed invisible: the shipped draft Banana rows show identity with every section
"not published", and no publication or evidence row exists in the migration set (tested on the real
migration set). The Banana shampoo/conditioner package and the Human A/B review material were not touched;
no reviewer name, review time, approval, capability, direction or claim was created or published. Nothing was
pushed, merged, deployed or applied to hosted Supabase or Cloudflare. Task 2.4 was not started.

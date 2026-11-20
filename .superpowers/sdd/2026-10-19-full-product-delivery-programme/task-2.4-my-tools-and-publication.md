# Task 2.4 — My Tools ownership and the tool catalogue publication boundary

Date: 21 October 2026. Base SHA: `50f6311` (`feat: add reviewed product details and evidence`).
Branch: `claude/strandcue-my-tools-publication`, in the isolated worktree
`C:\Users\ABADO\Desktop\StrandCue\.claude\worktrees\strandcue-catalogue-search-matching-b10b58`.
The canonical worktree was not touched. Node v24.19.0.

## Outcome

An owner can add a tool by hand (everything but the model is optional), see it in a list that states only what
was recorded, open it, edit the owner facts, correct a wrong identity by appending, search the tool catalogue,
compare an exact version side by side and match it only on an explicit confirmation, read what is published
about the matched version in a screen of its own, read an immutable history, and archive the tool. The tool
catalogue now has a publication boundary: consumers cannot read draft capabilities, claims, sources or
verification events, and the owner export no longer embeds raw catalogue rows.

## Baseline findings (before any change)

- Tool catalogue had the same exposure Task 2.3 closed for products: any signed-in consumer could read draft
  `tool_claims`, `tool_sources`, `tool_verification_events` (with reviewer names) and every capability column
  of `tool_versions`; the owner export (export v3) embedded whole tool version rows, claims and events.
- `user_tools` held only identity and availability; no wattage, settings, units, attachments, condition or
  heat methods; no correction path; matching was an unconfirmed-by-wording write.
- The mobile Tools screen was a thin list/detail with no owner facts, no history wording and no catalogue search.

## Domain and SQL behaviour

Owner facts use three states: an absent key is "never answered", an explicit null is "taken back", a value is
"recorded", which may itself be an explicit `{state: 'unknown'}`. Wattage and temperature are independent;
a temperature exists only when the owner typed it with a unit (C 30–300, F 86–572) and is never converted. A
diffuser is an attachment, never a heat method. Heat methods are direct-contact, heated-air, hooded, steam,
unheated (and an explicit unknown); unheated refuses any other method, any temperature and adjustable-yes.
Contradictions are refused in the domain, the form and SQL; nothing is silently repaired.

- Migration `20261023120000_tool_owner_facts.sql`: owner fact columns and validators; one SECURITY DEFINER
  write core owned by `strandcue_mutator`, SECURITY INVOKER public wrappers (`tool_add`, `tool_change`,
  `tool_correct`, `tool_match`, `tool_archive`); an operation ledger (`strandcue_private.tool_operations`) for
  idempotency (same operation id and payload replays; a different payload conflicts); owner profile row lock;
  expected-revision check; append-only revisions; corrections must materially change brand, model or type and
  carry a reason; a match only through a confirmed `match` revision, manual identity untouched; reads
  `get_user_tool_core` / `list_user_tools_core` bound to `request_uid()`; the list carries only the matched
  version's lifecycle (`catalogueLifecycle`) so a retired match is told without exposing capabilities.
- Migration `20261023130000_tool_catalogue_publication.sql`: `tool_publications` (subjects capabilities,
  successor, claim) and `tool_claim_evidence`; two-person review CHECK; content-digest binding; immutability
  guards with `row_security = off`; consumer revokes plus column grants (`tool_versions` readable by identity
  columns only); read-only role `strandcue_catalogue_reader` owning a narrow definer core behind an invoker
  wrapper (`tool_catalogue_detail`); identity-only `tool_catalogue_search`; owner context via the owner core;
  export narrowing and schema version 3 → 4 (JSON and CSV).
- Migration order: `20261023120000` then `20261023130000`, both after `20261022120000`. Dates were not renamed
  because of sequence dates. **No existing migration was edited**; both are new files, forward-only.
  Added `user_tools` columns are nullable; no backfill, no NOT NULL added.

## Mobile behaviour

New or rewritten: `tools.tsx` (list, empty, loading, failure/reload, pending saves, detail, history, owner-keyed
remount), `tool-editor.tsx` (add, edit, correct, archive), `ToolMatch.tsx` (search, comparison, explicit
confirmation, retry), `ToolCatalogueDetail.tsx` (read-only secured detail), `tool-api.ts`,
`tool-catalogue-api.ts`, `tool-copy.ts`, `tool-form.ts`, `tool-drafts.ts`, `tool-history.ts`, `focus.ts`.
Drafts are written before they are sent and retried with the same operation id; a stale revision drops the
draft; selecting, going back and cancelling write nothing; a retired exact version stays matchable and is
labelled retired, with no successor substituted; the owner switch remounts and drops all state.

## RED and GREEN evidence

| Area | RED captured | GREEN |
|---|---|---|
| Owner-facts DB tests (`tools-owner`) | partly: list `catalogueLifecycle` test RED 2 failed; the original owner-facts migration was written **before** its database tests | 31 passed |
| Tool catalogue DB tests | initial publication migration written with its tests in the same step; no separate RED | 23 passed |
| `tool-match` | module missing ("no tests"); one bad test line of mine fixed | 18 passed at first GREEN, 21 after review fixes |
| `tool-catalogue-detail` | module missing | 14 passed |
| `tools-screen` | 16 failed (`capabilitySummary is not a function` in the old screen) | 16 passed at first GREEN, 21 after review fixes |
| Review-driven fixes | each batch RED first: 6 failed (copy/drafts/form), 14 failed (screens), 2 failed (digest, wattage cast), 3 failed (message focus, resumed discard) | all passed |
| `tools-integration` | written after the screens; no separate RED | 12 passed |

**Missing RED evidence, disclosed:** the owner-facts migration was written before its database tests;
`tool-api`, `tool-copy` and the first `tool-catalogue` domain tests were written and first run after the code;
the integration tests were written after the screens they drive.

## Publication and export security boundary (verified by the database review)

Export v4 holds no raw `tool_versions`/`tools`/`tool_claims`/`tool_sources`/`tool_verification_events` row and
no draft capability: the matched `catalogueVersion` is an allowlist of id, tool id, version label, market,
lifecycle and created-at; `claims` and `verificationEvents` stay empty arrays; both the JSON and the CSV files
carry the owner's own facts and revisions only. Consumers have no direct access to draft tool content; reviewer
names and verification events are unreachable through any function, view or error; owner-context reads are
bound to the caller and answer `not-found` for another owner's tool; general catalogue reads carry no owner
facts; every refused write mutates nothing (the ledger insert is last); a match leaves the manual record intact;
idempotency and replay verified; `search_path` and grants hardened on every definer function. **Nothing is
published:** the shipped migrations insert no publication row.

## Verification (Node 24.19.0)

| Gate | Result |
|---|---|
| `npm run check:runtime` | PASS |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, exit 0, zero warnings |
| `npm run test:coverage -- --maxWorkers=4` | PASS, exit 0: 163 files passed, 3 skipped; 3137 tests passed, 11 skipped |
| `npm run export:web` | PASS, exit 0 |
| `npm run audit:control-plane` | PASS (`METADATA-PASS`) |
| `npm run audit:dependencies` | **HOLD**, exit 1: `DEPENDENCY-POLICY-HOLD`, codes `ADVISORY-UNEXCEPTED` (root tree) and `RUNNER-REVIEW-DRIFT`; no package manifest was changed by this task; **not a pass** |
| `git diff --check` | clean, exit 0 |

Focused totals: domain (`tools`, `tools-owner`, `tool-catalogue`, `product-detail`) 59; database (`tools`,
`tools-owner`, `tool-catalogue`, `export`, `migration-inventory`) 95; mobile (`tool-api`, `tool-copy`,
`tool-form`, `tool-editor`, `tool-match`, `tool-catalogue-detail`, `tools`, `tools-screen`,
`tools-integration`) 162. Previous full suite: 2898 passed.

Coverage (full run): all files 95.89 statements / 90.4 branches / 98.46 functions / 97.9 lines. New or
materially changed logic files: `ToolMatch.tsx` 92.77 / 88.23 / 96.87 / 97.5; `tool-copy.ts` 97.48 / 92.01 /
94.11 / 97.98; `tool-editor.tsx` 94.25 / 90.12 / 100 / 97.12; `tool-form.ts` 100 / 97.81 / 100 / 100;
`tools.tsx` 95.27 / 90.66 / 96.22 / 98.3; `tools.ts` (domain) 99.12 / 97.77 / 100 / 100. The remaining new
files are gated per file at 80% in `vitest.config.ts` and the run passed; fully covered files are not printed
by the reporter. One database test (`shelf.test.ts`) timed out once in a parallel database-only run and passed
alone (103) and in the full run.

## Reviews and resolutions

Three fresh independent reviews, then focused re-reviews of every fix.

- **Database/security/export:** no Critical or High. Medium — the capabilities review digest skipped NULLs, so
  a wattage and a max temperature could swap unseen (fixed, tested). Low — `wattageWatts: 1500.0` passed
  validation but failed a raw integer cast (fixed, tested). Re-review: both CLOSED.
- **Code:** Mediums — a refused resumed command left an empty form; permanent failures offered as retry and a
  sign-in failure dropped a valid command; a landed save reported as failed when tidying the device copy
  failed; Edit/Correct/Archive could overwrite an unsent command; product wording on tool matching; clearing
  drafts could not repair a damaged index and failed silently. Lows — empty "I will list them" silently
  dropped an answer; unreadable history values could crash render. All fixed with tests. Re-review found one
  more Medium (empty form after deleting a resumed command): fixed and re-checked.
- **Accessibility:** High — every search outcome announced twice; look-alike candidate names collided.
  Mediums — duplicate speech on details and history, collided list names, id fragments in names, wrong summary
  spoken, focus after refusal, missing header role on the destination title. Fixed. Re-review found one Medium
  (failure messages spoken twice by announcement plus focus): fixed so each message is said once, at the
  message, which takes focus; final re-review CLOSED.

## Accepted Low findings

- Focus is not moved to the destination screen's title after a successful match or save (an announcement
  carries it); the focus move on messages has no direct test; the add-mode intro text still shows after a
  resumed draft is deleted.
- Label-in-name differs in a few buttons (visible text is shorter than the spoken label); pills' width and the
  group-label semantics of `MultiChoice` are unverified without a device.
- Pre-existing Shelf and product screens still print a catalogue/reference code fragment; tools no longer do.
- `ToolDetail` names two types (owner record in `tool-api.ts`, catalogue detail in the domain package);
  unused editor problem state; correction mode shows field validation it does not enforce client-side.
- `get_user_tool_core` ignores `p_include_audit`; the list excludes archived tools, so an archived tool's
  detail is reachable only right after archiving; archiving through `tool_add` is allowed (never sent).
- Review digests do not bind version, subject or claim ids and use a U+001F separator that is not forbidden in
  claim text (both need a privileged writer); guards do not cover `tools`/`tool_brands` name edits after
  publication (mirrors Task 2.3).
- Export documents written as v3 before this migration stay downloadable by their owner until their 24-hour
  expiry; legacy revision shapes may be refused as correction targets on a populated database (unverified).
- Hosted behaviour of role creation and `grant ... with set true` is unverified on a real instance.

## Remaining HOLDs

`audit:dependencies` (`ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT`); real two-session PostgreSQL concurrency
and hosted owner isolation remain external gates; device acceptance for the journey is outside Task 2.4;
Banana Human A/B review remains pending.

## Statements

Nothing was pushed, merged, deployed or applied to hosted Supabase or Cloudflare. No content was published, no
reviewer identity was filled in, no capability, claim or direction was created, and the Banana Human A/B
package was not touched. Task 2.5 was not started. The tools export no longer embeds raw catalogue rows.

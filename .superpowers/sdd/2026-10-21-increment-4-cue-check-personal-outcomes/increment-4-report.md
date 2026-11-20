# Increment 4 report: Cue Check and personal outcomes

## Result

Increment 4 is delivered as an alpha mechanism: a private, owner-only Cue Check chain from a
server-confirmed terminal execution through persistence, API, state machine, visible form,
correction, Journey history, honest summary, removal, export, account deletion and owner switching.
In the full product specification it remains Partial (see "Requirements status"). It is not a launch
decision on its own: two product/privacy decisions are open (below).

## SHAs and commit chain

- Closure pass started at `3673f617521508a58b6448b5720564a288d031d6` (direct parent `b1b6047`).
- Final code SHA before this report: `ad1a6d1` (`fix: close Increment 4 review findings`). The closing
  commit `docs: close Increment 4 Cue Check delivery` carries this report; read its hash with
  `git rev-parse HEAD`.
- Chain: `d00e533` Task 4.1 domain and honest summaries; `cc77ff7` Task 4.2 persistence;
  `b1b6047` Task 4.3 client boundary; `3673f61` Task 4.4 visible experience; `ad1a6d1` review fixes.
- Review range note: the plan's `cc77ff7^..3673f61` excludes Task 4.1, so reviewers were given
  `0513846..3673f61` to cover all four tasks.

## Migrations

- `20261024090000_cue_checks.sql` (Task 4.2, unchanged since its commit): forced-RLS owner tables,
  private operation ledger, hardened definer cores, export v5, deletion cascade.
- `20261024100000_cue_check_review_fixes.sql` (this pass, forward-only): pages keyed on immutable
  `created_at, id` with a `{createdAt, id}` cursor and new index; missing observation timing rejected
  with the stable code and validation made STABLE; head row cannot rewrite goal, confirmed steps,
  execution status or creation time or return from removed to active; replaying an export operation
  returns the stored receipt untouched (narrow `UPDATE(result)` grant and owner-scoped policy on the
  export operation ledger).

## Architecture

terminal stored execution -> server-derived binding and confirmed steps -> `record/correct/void/list/get`
RPCs -> strict schemas in `cue-check-api.ts` -> pure reducer and controller in `cue-check-state.ts`
(one controller per owner, request tokens, stable operation ids, `lastSaved` marker) -> screens
(`CueCheckForm`, `CueCheckDetail`, `CueCheckHistory`, `CueCheckSummary`, `CueCheckVoidConfirmation`,
`CueCheckJourney`, entry point and routines) -> Journey "Check-ins" view. Summaries come only from
`summarizePersonalOutcomes`. Nothing reaches recommendations, guidance, catalogue or analytics.

## RED / GREEN

Each task recorded genuine RED first (see the Task 4.1 to 4.4 reports). In this pass: the combined
journey test was added; review-driven RED tests failed before each fix (state, announcements, error
copy, form/void/history/detail/entry accessibility, journey recovery, and database tests that failed
with the new migration moved aside, then passed). Test-side defects found by reviewers (vacuous
assertions, an incoherent `touch()` fixture, no lost-response model) were fixed.

## Test totals (final tree)

- Full coverage run: 188 files passed / 4 skipped; 3982 tests passed / 18 skipped. Global
  95.95 / 90.35 / 98.13 / 97.89 (statements / branches / functions / lines).
- Cue Check mobile suites: 11 files, 336 tests. Database suites run with the migration
  (cue-checks, export, deletion, migration, migration-inventory, hardening, owner-isolation-scenarios):
  7 files, 121 tests.
- An earlier full run hit a 10 s hook timeout in `tests/database/shelf.test.ts` under load; the file
  passes alone and repeated full runs were clean.

## Per-file coverage for Increment 4 logic (statements / branches / functions / lines)

| File | Stmts | Branch | Funcs | Lines |
| --- | --- | --- | --- | --- |
| cue-check-api.ts | 96.42 | 90.9 | 100 | 95.89 |
| cue-check-copy.ts | 100 | 91.66 | 100 | 100 |
| cue-check-errors.ts | 96 | 94.11 | 100 | 100 |
| cue-check-records.ts | 100 | 91.66 | 100 | 100 |
| cue-check-routines.ts | 90 | 90 | 100 | 100 |
| cue-check-state.ts | 95.56 | 91.9 | 100 | 100 |
| CueCheckAnswers.tsx | 100 | 88.88 | 100 | 100 |
| CueCheckForm.tsx | 100 | 96.1 | 100 | 100 |
| CueCheckHistory.tsx | 100 | 96.66 | 100 | 100 |
| CueCheckJourney.tsx | 95.29 | 87.5 | 89.65 | 98.57 |
| CueCheckRoutines.tsx | 94.11 | 93.75 | 100 | 100 |
| CueCheckSummary.tsx | 100 | 95.45 | 100 | 100 |

Other new files (detail, timeline, question, void confirmation, entry point, form model, entry,
announce, hook) are 100% on all four metrics and omitted from vitest's text table. Domain
`cue-check.ts` 98.8 / 97.43 / 100 / 98.68. All new logic files carry the 80% per-file floor.

## Independent reviews

Four reviewers ran in isolated contexts, read-only, over the actual code and tests: code and state
integrity; PostgreSQL/RLS/export/deletion security; accessibility and owner switching; plain-language
and non-causal wording. Each re-reviewed the fixes. Final verdicts: code and state approved; database
approved; accessibility signed off after one regression (heading focus re-firing on edit) was fixed;
wording acceptable to ship once the reaction-question item is decided.

| Severity | Finding | Resolution |
| --- | --- | --- |
| High | Cancelling an edit announced "saved"/"removed" to screen readers | Reducer `lastSaved` marker; cancel tests |
| High | Retry/Reload not reachable on iOS (grouped error block) | Ungrouped; ref on the message |
| High | "Maybe" vs "Not sure" miscounted and mis-described | Option now "Undecided"; domain wording says undecided/choose |
| High | Reaction question has no safety path | Mitigated with a neutral note; OPEN product/safety decision |
| Medium | Screen stuck on "Loading" with Reload disabled | Journey reloads when idle and nothing is open |
| Medium | Correction/removal dead end after a failed reload | Reload shown whenever required; failures shown in the form |
| Medium | Paging on a mutable key could hide changed records | Forward migration; `createdAt` cursor |
| Medium | Export replay changed an issued export | Replay returns stored receipt; ledger updated |
| Medium | Retention of copied steps and receipts past execution window | Documented as current behaviour; OPEN decision |
| Medium | Error channels (iOS silent / Android double), focus lost on view swaps, Save enabled but inert, edits dropped while saving | One channel per error; heading focus on open; disabled with hint |
| Medium | Void failure copy promised answers; malformed copy ambiguous | Per-source copy |
| Low (fixed) | History refresh failure loaded forever; mismatched receipt trapped save; stale routine request; misleading comments; weak tests | Fixed with tests |

## Privacy and publication-boundary proof

- Forced RLS on all three Cue Check tables; anonymous and direct authenticated writes denied; foreign
  and random ids indistinguishable; confirmed actual use only from server-confirmed steps; client
  cannot supply owner, run, goal, steps, status or timestamps (database and API tests).
- Operation receipts excluded from export; export v5 includes only the owner's records and revisions;
  profile deletion removes records, revisions and receipts.
- Catalogue, publication, evidence and recommendation authority rows are byte-identical across Cue
  Check mutations (`cue-checks.test.ts`). Component journey asserts zero recommendation, execution,
  client or catalogue calls and production draft guidance `content_pending`.
- No catalogue evidence, reviewed guidance, product, capability, rule or reviewer content was touched.

## Accessibility evidence actually run

Component-level tests (react-test-renderer over a host mock): roles, unique names, selected/busy/
disabled states, hints, ungrouped alerts, single announcement channel, heading focus calls, announce
unit tests, owner-switch first-commit capture, touch-target styles. Contrast ratios were computed by
the reviewer. No device, emulator, TalkBack, VoiceOver or hardware-keyboard run was performed.

## Gates

Runtime PASS (v24.19.0); typecheck PASS; lint PASS, zero warnings; coverage PASS; web export PASS;
control-plane audit exit 0; `git diff --check` clean. Dependency audit exits 1 =
`DEPENDENCY-POLICY-HOLD` (0 critical, 19 high, 9 moderate; root advisories plus EAS-runner and
mutation-runner review drift), unchanged from Tasks 4.2 to 4.4. Research validation script exists
(`validate-guidance-research.ts`) and was not part of this pass's evidence.

## NOT RUN (not relabelled as passed)

Hosted owner isolation; UI journey against a real database or local Supabase stack; device or
emulator testing; TalkBack/VoiceOver; physical-device evidence; two-session real-PostgreSQL
concurrency.

## Accepted Low findings

- Evidence for the visible journey is against an in-memory fake of the five RPCs.
- A privileged role can still rewrite `observation` without a revision row, and TRUNCATE is unguarded.
- Concurrent first-time retries with the same operation id can hit a raw unique violation (no replay).
- Migration `20261024090000` fails for a non-superuser applier other than `migration_admin`.
- Whitespace-only notes count as content on the server; `observedAt` has no lower bound; note length
  is counted in code points server-side and UTF-16 units client-side.
- Create does not check that the run is trusted (every execution start requires one today).
- Owner-isolation scripts have no Cue Check scenarios; `cue_checks_owner_received` index now unused.
- Product-specified wording kept despite reviewer suggestions: "Tell us how your hair felt",
  "changed on another session", duplicate-active and quota copy, satisfaction/dryness prompts.
- Summary covers loaded check-ins only (and says so); duplicate detection uses the loaded page;
  `observedAt` is the device clock; StrictMode would drop a routine request (app does not use it);
  timeline heading hierarchy; the radio `selected` convention is pre-existing.

## Requirements status after Increment 4

CC-01 to CC-05 Partial; CC-06 to CC-08 Not started. Cue Check is complete as an alpha mechanism but
not as the full personal-learning system. J-01 and J-02 are touched only for the Cue Check portion.

## Remaining product gaps for future planning

Personal ranking and explanations (CC-06/07), personal experiments (CC-08), scheduled/later reminders,
adverse-reaction record and escalation (SF-04/SAFE-02),
real-database and device/TalkBack acceptance, summary over the complete history, owner-isolation
scenarios for Cue Checks, export/privacy documentation review.

## Launch decision

Not ready for public launch on the strength of Increment 4. On 2026-10-22 the product owner made the
two open decisions: the reaction question is dormant for new input and summaries while historical
answers remain readable, and Cue Check receipts expire after 30 days while owner history and copied
confirmed steps remain for the account life. A future SF-04/SAFE-02 flow still requires reviewed
safety handling. The dependency audit HOLD and the NOT RUN items above remain.

## Boundaries confirmed

Nothing was pushed, merged, deployed or applied to hosted services; no Supabase, Cloudflare or Play
Console setting changed; no content was published and no reviewer identity created. Increment 5 was
not started.

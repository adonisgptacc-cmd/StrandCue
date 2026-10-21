# Task 3.2 report - targeted questions and setup recovery

Worktree: `C:\Users\ABADO\Desktop\StrandCue-increment-3-gap-resolver`
Branch: `codex/increment-3-guidance-gap-resolver`
Base: `e282ae9` (`codex/full-product-integration`)
Node: `v24.19.0`

## 1. What was built

When Today cannot safely prepare or generate guidance, the owner now sees a
**GuidanceGapResolver**: one screen-level card per thing that is missing,
unknown, contradictory, unsupported or temporarily unavailable, each with a
plain-language description, a destination, and one action that names where it
goes.

| Piece | Where |
|---|---|
| The resolver surface | `apps/mobile/src/GuidanceGapResolver.tsx` |
| The pure resolver state (routing, order, keys, announcement) | `apps/mobile/src/guidance/guidance-gap-state.ts` |
| The gap contract (reason, owner-facing label, `content_pending`) | `packages/domain/src/guidance/types.ts`, `schemas.ts` |
| The gaps themselves (what is missing, unknown or unusable) | `packages/domain/src/guidance/prepare-guidance.ts` |
| The check-in that survives the trip, the zones, the session store | `apps/mobile/src/guidance/current-condition-state.ts`, `apps/mobile/src/TodayCheckIn.tsx` |
| The service that maps a failed read to a resolver item | `apps/mobile/src/guidance/today-guidance-service.ts` |
| The route table the resolver navigates through | `apps/mobile/src/navigation.ts` |

### The six gap states stay apart

`missing`, `unknown`, `contradictory`, `unsupported`, `failed_source` and
`content_pending` are six distinct states with six distinct leads
(`GAP_STATE_LEAD`). A required Passport fact recorded as `unknown` is now an
honest gap instead of being read as a recorded value; a failed read becomes a
`failed_source` item that names the area it could not read; content that is
not published is a `content_pending` item with **no action at all**, because
there is nothing the owner can do about it.

### The destinations

| Route | Used for |
|---|---|
| My Hair | a missing or unknown durable Passport fact |
| My Hair, Services | an unknown or unsupported chemical-service record, and a missing service zone |
| My Shelf | no suitable owned product, an unmatched manual product, a matched version with no published reviewed capability, an unavailable product, a fact that must be confirmed |
| My Tools | a tool that is not recorded or not available, an unknown heat method, an unknown exact temperature, an unmatched tool |
| Today's check-in | contradictory answers, a stand-alone answer, a missing goal or time, an unusable temporary answer, a missing zone answer |
| Retry the read | a Passport, Shelf, Tool, activity or service read that failed |
| Nothing to do | content that is not published yet |

### What the app will not do

It never guesses a missing fact, never silently chooses a product, never
treats an unknown product as reviewed and never bypasses a draft or withdrawn
content gate. A wattage is never read as a temperature; a tool name is never
read as a heat method.

## 2. RED evidence

The new tests were run against the base implementation before the feature
existed. The source files were stashed (`git stash push -- apps/mobile/src
packages/domain/src`) and the two new source files were moved aside, so the
tests ran against exactly `e282ae9`.

```
FAIL tests/mobile/guidance-gap-resolver.test.tsx
  Error: Cannot find module '/apps/mobile/src/GuidanceGapResolver'
  imported from .../tests/mobile/guidance-gap-resolver.test.tsx

FAIL tests/mobile/guidance-gap-state.test.ts
  Error: Cannot find module '../../apps/mobile/src/guidance/guidance-gap-state'
  imported from .../tests/mobile/guidance-gap-state.test.ts

Test Files  2 failed (2)
     Tests  no tests
```

The domain-level RED, run the same way against `e282ae9`:

```
tests/domain/guidance/prepare-guidance.test.ts (99 tests | 8 failed)
  x treats a required Passport fact recorded as unknown as an honest gap
  x tells two services with the same presence state apart, and shows no id
  x names a service by its recorded date when it has no type
  x never lets an unmatched manual product satisfy an exact prerequisite
  x offers My Shelf when an owned product is no longer available
  x never reads a temperature from a wattage, and asks for the exact one
  x asks for the tool itself when a reviewed rule needs heat and none is recorded
  x never blocks a plan on an owner setup item

Test Files  1 failed (1)
     Tests  8 failed | 91 passed (99)
```

## 3. GREEN results

```
Focused Task 3.2 suites
  tests/mobile/guidance-gap-state.test.ts        30 passed
  tests/mobile/guidance-gap-resolver.test.tsx    40 passed
  tests/mobile/current-condition-state.test.ts   51 passed
  tests/mobile/today-check-in.test.tsx           12 passed
  tests/mobile/today-guidance.test.tsx           34 passed
  tests/mobile/today-guidance-service.test.ts    28 passed
  tests/domain/guidance/prepare-guidance.test.ts 99 passed
  tests/domain/guidance/schemas.test.ts          12 passed
  tests/domain/current-condition.test.ts         15 passed
```

Full suite: **3382 passed, 18 skipped, 0 failed** (174 files).

## 4. Full gate results

| Gate | Result |
|---|---|
| `npm run check:runtime` | `NODE-RUNTIME-PASS v24.19.0` |
| `npm run typecheck` | 0 errors (domain + mobile) |
| `npm run lint` | 0 errors, 0 warnings (`--max-warnings=0`) |
| `npm run test:coverage -- --maxWorkers=4` | pass; no threshold error |
| `npm run export:web` | pass |
| `npm run audit:control-plane` | pass |
| `npm run audit:dependencies` | **HOLD** (see below) |
| `git diff --check` | 0 |
| changed-file secret scan | 0 findings |
| `git status --short` | clean at the stop point |

## 5. Changed-file coverage

| File | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `apps/mobile/src/GuidanceGapResolver.tsx` | 95.34 | 97.43 | 90.00 | 97.36 |
| `apps/mobile/src/guidance/guidance-gap-state.ts` | 95.23 | 81.73 | 85.71 | 96.00 |
| `apps/mobile/src/guidance/guidance-copy.ts` | 99.31 | 100 | 95.45 | 100 |
| `apps/mobile/src/guidance/current-condition-state.ts` | 94.11 | 92.72 | 93.02 | 94.54 |
| `apps/mobile/src/TodayGuidance.tsx` | 86.98 | 85.62 | 87.80 | 89.86 |
| `packages/domain/src/guidance/prepare-guidance.ts` | 95.07 | 83.09 | 100 | 98.72 |
| Whole covered set | 95.77 | 89.82 | 97.99 | 97.74 |

Every new or materially changed logic file is at or above 80% on all four
measures. `apps/mobile/src/GuidanceGapResolver.tsx` was added to
`vitest.config.ts` so the per-file floor is enforced by the gate, not by
convention.

## 6. Review 1 - code correctness and maintainability

| Finding | Severity | Fix |
|---|---|---|
| A concern left attached to a zone after it was un-ticked, so the draft could not be sent and the owner was silently bounced | High | The reducer now drops a removed concern from every zone, and `zone_concern_unreported` reports it in the form |
| The normalization failure was swallowed, so the owner was returned to the form with no reason | High | `back_to_check_in` now carries `check_in_unusable`, with its own copy |
| A raw NUL byte in the source made the file a binary blob | Medium | The separator is the escape `'\u0000'`; no NUL byte remains in any source file |
| A gap with no destination rendered a button that navigated nowhere | Medium | The route falls back to the kind's route, and a gap with nowhere to go gets no action |
| `back_to_check_in` kept the old result, so the previous plan rendered during a regeneration | Medium | The result is cleared with the return to the form |
| The resolver's announcement contradicted its heading | Medium | The announcement is role-aware (`attention`, `setup`, `failed`, `content`) and the headings are content-specific |
| Optional setup items were listed as "needed before a plan" | Medium | Blocking gaps and optional setup are separate lists, under separate headings |
| Only one named area had to carry an answer | Medium | Every named area must carry an answer |
| The domain's gap comparator was not a valid comparator | Medium | It returns 0 for equal subjects now |
| The owner-change clear was unreachable, and account deletion did not clear the session | Medium | The session store now forgets the previous owner when another owner is served, and the deletion path clears it |
| Dead and duplicated exports (two routing tables, two source-error formatters) | Medium | Removed; the routing lives in one place |
| A zone that lost its last answer stayed and blocked the form | Low (security round) | The area leaves with the answer that left it |
| The retry failure said "again" after any earlier plan | Low | Only a failed read counts as an attempt |
| The "could not read again" message appeared on the first failure | Low | Fixed in the same change |

## 7. Review 2 - security, privacy, owner isolation and publication boundaries

| Finding | Severity | Fix |
|---|---|---|
| The check-in is persisted in the owner-scoped private run record, which contradicted three "session-only" statements | Medium | **Not** removed: the Task 3.1 audit design stands. Every claim is now accurate instead: the owner-facing boundary says the answers stay on the device for the session and that the facts a plan used are kept in the private record; the comments and both requirement documents say the same |
| Account deletion did not clear the check-in or the resolver state | Medium | `DeletionScreen` clears the owner's session on the success path, before the alive check |
| A non-button sign-out left the session populated | Low | `auth.tsx` clears on the revoked-session and `SIGNED_OUT` paths |
| The retry-attempt flag was never reset on an owner change | Low | Reset in the owner effect |
| A raw record id was carried on the resolver item | Low | Renamed `internalSubject`, documented as never rendered, and kept out of the render key's wording |
| The run-record disclosure over-claimed for a `ready` plan | Low | The documents now scope it to the outcomes the app may store privately |

Clean and re-verified: owner isolation of the session store; no logging or
analytics of condition answers; no new grants, endpoints, permissions or
migrations; the draft and withdrawn content gates unchanged; no raw id, field
path, SQL detail, reviewer name or draft evidence on screen; the check-in
never reaches the Hair Passport.

## 8. Review 3 - accessibility and plain language

| Finding | Severity | Fix |
|---|---|---|
| Focus restoration used `.focus()` on a non-focusable view, and never used the repo's `focusOn` helper | High | The resolver and the check-in use `focusOn` (`AccessibilityInfo.setAccessibilityFocus`) |
| The announcement was derived from the item count, so a changed set with the same count was silent | High | The announcement names the items, and the state is spoken once |
| The state was announced two or three times | High | One channel per platform: the live region on Android, the platform announcement on iOS; the resolver uses no alert role |
| The action labels said "this" without naming the subject | Medium | "Add your strand thickness in My Hair", "Match your saved shampoo in My Shelf" |
| The heading was wrong for a failed read and for content | Medium | Content-specific headings: "What is needed before a plan", "What we could not read", "What is not available yet", "What you could add next" |
| A fixed line height clipped text at large font scales | Medium | The fixed line height is gone from the text styles, including the error style |
| The time input repeated the section title | Medium | The input has its own label, "Minutes of time available" |
| The observation time was spoken as a raw timestamp | Medium | It is spoken in plain words: "13 October 2026, 8:00 am" |
| The zone groups had no group semantics | Medium | The area and part groups are labelled groups; every control says which group it is in |
| The selected state was shown by colour alone | Medium | A tick is shown on every selected pill, area and choice |
| The error summary was announced without saying what was wrong | Medium | The alert now carries the first message with its heading |
| `statusTitle` said "rule conflict" and "unsupported" | Medium | "Two reviewed rules disagree here", "Nothing reviewed covers this yet" |
| A raw version id was shown to the owner | Medium | The product is named instead |
| The raw ISO example in the error copy | Low | The example no longer carries a timezone offset |
| The retry button did not say it was busy | Low | It says "Trying again…" in words as well as in state |
| The exclusive-answer clear was silent | Low | It is announced in the check-in's live region |
| The goal radio group had no label | Low | It is a labelled group |
| A zone chip could overflow at large font sizes | Low | It wraps |
| The content-pending card said the same thing three times | Low | The title and the body no longer repeat each other |

### Accepted findings and their practical effect

| Finding | Severity | Why it is accepted | Practical effect |
|---|---|---|---|
| The engine's own wording inside the decision view - step reasons that carry a rule reference, and the omission sentences - still reaches the owner | Medium | That surface is the **protocol preview**, which is Task 3.3's to redesign. The Task 3.2 stopping rule says not to start Task 3.3, and changing the preview's wording here would be doing exactly that. | On a produced plan the owner can still see a rule reference such as `rule-wash@1` in a step reason, and a fact path such as `profile.unrecorded` in "Still needed". The **resolver** never shows either. Deferred to Task 3.3, with the existing test that pins the current wording left in place. |
| The check-in facts a generated plan read are kept in the owner-scoped private run record | Medium | The Task 3.1 audit decision, kept on purpose | For the outcomes the app may store privately, the facts that plan read are in the owner's own private record. The row is owner-scoped by forced RLS and is removed with the account. It is never the Passport, and the owner-facing text now says so. |
| `setAccessibilityFocus` is Android-only, so the focus move is inert on iOS | Low | A React Native platform limit | On iOS the state is carried by the platform announcement instead, and the visible text stays on screen to be re-read. |
| The client asks to store a `ready` plan, which the server refuses by design | Low | Pre-existing from Task 3.1, not introduced here | A produced plan shows "audit save failed" beside the plan. The plan itself stands and is never regenerated. Left alone rather than half-changed. |
| The render-phase owner-change branch is a belt-and-braces path, because `records.tsx` keys the screen by owner | Low | The keyed remount is the production guarantee; the branch covers a prop change without a remount | No frame of the previous owner's check-in can be painted: the keyed remount resets the screen, and the session store forgets the previous owner when another owner is served. |

## 9. Traceability changes

- `docs/product/full-product-capability-matrix.md`: HP-06, TD-02 and TD-03
  rows updated with the Task 3.2 evidence. All three stay **Partial**.
- `docs/product/requirement-traceability.md`: the HP-06 and TD-03 rows
  updated with the same evidence and the same wording. Both stay **Partial**.
- `.superpowers/sdd/2026-10-21-increment-3-condition-aware-today/status.md`:
  created.
- This report: created.

Nothing was promoted: the production reviewed bundle is still `draft` with
empty capabilities and a withdrawn placeholder rule, so production Today still
returns `content_pending` and still produces no plan.

## 10. What was deliberately not done

- **Task 3.3** (protocol-preview redesign) was not started.
- No synthetic recommendation rule, product capability, efficacy claim or
  reviewer field was created.
- No Cue Check, photo capture, barcode or OCR, weather, routine audit,
  reminder, AI diagnosis or image analysis was added.
- No database migration was written: Task 3.2 needed no schema change, and
  no hosted migration was applied.
- No production content status was changed, and no content was published.
- Nothing was pushed, merged, deployed or published; no Supabase, Cloudflare
  or Auth setting was changed; the research worktrees were not touched.

## 11. The dependency-audit HOLD

`npm run audit:dependencies` exits 1 with
`{"status":"DEPENDENCY-POLICY-HOLD","findingCount":23,"findingCodes":["ADVISORY-UNEXCEPTED","ADVISORY-SURFACE-UNIDENTIFIED","EXCEPTION-PATH-STALE","RUNNER-REVIEW-DRIFT"],"summary":{"critical":0,"high":20,"moderate":6,"reviewedAdvisories":4}}`:

| Manifest | Status | Findings | Codes |
|---|---|---|---|
| `package.json` (root) | HOLD | 22 | `ADVISORY-UNEXCEPTED`, `ADVISORY-SURFACE-UNIDENTIFIED`, `EXCEPTION-PATH-STALE` |
| `tools/eas-runner/package.json` | HOLD | 1 | `RUNNER-REVIEW-DRIFT` |
| `workers/account-deletion/package.json` | PASS | 0 | - |
| `tools/mutation-runner/package.json` | PASS | 0 | - |

This is a **HOLD**, and it is not a pass. Task 3.2 changed no
`package.json`, no `package-lock.json`, no worker and no migration file
(`git diff --stat e282ae9..HEAD -- package.json package-lock.json
apps/mobile/package.json workers tools supabase` is empty).

The finding count differs from the baseline run because the audit reads the
live npm advisory feed, which moved during the task: the baseline recorded 4
findings (`ADVISORY-UNEXCEPTED`, `RUNNER-REVIEW-DRIFT`) and the final run
records 23. The **primary checkout reports the same 23 findings**, so the
movement is upstream, not a consequence of Task 3.2. The status is a HOLD
before and after.

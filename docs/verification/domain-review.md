# Domain Review

Reviewed scope: `.superpowers/sdd/2026-09-09-foundation/task-1-brief.md`, `docs/superpowers/specs/2026-09-09-foundation-design.md`, `packages/domain/src/*.ts`, and `tests/domain/*.test.ts`.

Verification run: `npm test -- tests/domain` passed on 2026-09-10 with 3 files and 19 tests.

## Findings

### High: `undefined` patch fields are accepted and can erase known values without ambiguity

`PassportPatchSchema` is built from `PassportObjectSchema.partial()` and then treats any own key as a change (`packages/domain/src/passport.ts:169`). Because Zod optional fields allow a present value of `undefined`, `PassportPatchSchema.parse({ goals: undefined })` succeeds and preserves `goals` as an own key. `projectHistory` then iterates `Object.entries(fact.revision.patch)` and projects that entry as a real field fact (`packages/domain/src/history.ts:279`), eventually setting `values.goals` to `undefined` with no `ambiguousFields.goals` entry (`packages/domain/src/history.ts:381`).

This violates the design invariant that unknown differs from unanswered. It gives callers a third unmodeled state, "answered with undefined", and lets a later revision silently clear a required baseline field without using the explicit `unknown`, `none`, or `null` states. The same risk exists for optional baseline fields because `PassportSchema.parse({ ..., porosity: undefined })` preserves `porosity` as an own key and projection emits that key as a value.

Fix direction: reject own properties whose value is `undefined` at the Passport and patch boundaries, or normalize parsed objects by removing undefined-valued own keys before the non-empty patch check and before projection. Add tests for `PassportPatchSchema.safeParse({ goals: undefined })`, optional baseline fields present as `undefined`, and a history revision that attempts to project such a patch.

### Medium: `baseRevision` is parsed but never enforced

Every revision carries `baseRevision` (`packages/domain/src/history.ts:22`), but `projectHistory` only checks the baseline count, passport identity, duplicate ids/sequences, correction target existence/order, and correction cycles (`packages/domain/src/history.ts:434`). It does not reject stale changes such as a sequence-2 change with `baseRevision: 0` after a sequence-1 baseline, nor does it reject sibling edits that both claim the same base revision.

The foundation design explicitly calls out stale revisions and retries as required behavioral tests, and says revision conflicts must preserve unsaved input. With the current domain contract, stale edit detection is not represented by a schema/result type and is not enforced by projection, so later service/database consumers can accidentally accept conflicting history while still passing the shared domain validation.

Fix direction: either make `projectHistory` validate the monotonic base-revision chain for accepted revision histories, or add separate append-command/result schemas that enforce expected-base semantics before revisions are persisted. Add tests for stale base revision, duplicate sibling base revision, retry with identical operation id, and retry mismatch.

### Medium: date validation and default as-of depend on the process UTC date

`currentDateOnly()` derives today's date with `new Date().toISOString().slice(0, 10)` (`packages/domain/src/dates.ts:23`), and `projectHistory` uses the same UTC conversion when `options.asOf` is omitted (`packages/domain/src/history.ts:447`). These are date-only domain values, but the comparison is tied to the process clock and UTC day boundary.

This can reject or accept facts differently around local midnight depending on where the code runs. For example, a user entering a local "today" date in a positive-offset timezone can be rejected while UTC is still the previous calendar day. It also makes boundary tests for future-date handling nondeterministic unless they avoid realistic dates.

Fix direction: make the current date an explicit input for schema validation/projection, or centralize an application-level calendar date provider with documented timezone semantics. Add boundary tests for local today, tomorrow, current month, and current year behavior.

## Coverage Notes

The current tests cover leap-day validation, impossible dates, unknown precision, corrections of corrections, branching corrections, correction cycles, same-field ambiguity, historical as-of projection, and nonmutation.

The requested stale revision and retry fixtures are not present in `tests/domain/*.test.ts`. The undefined-field cases above are also not covered.

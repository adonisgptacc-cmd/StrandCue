# Task I5.2 report — wash counting by named unit

## outcome

Task I5.2 is complete on top of `1e58c0b`. It adds a pure, deterministic domain function
`countWashes(events, rule, asOf): WashCountResult` that counts elapsed washes or shampoo
sessions after a confirmed treatment application, using only active canonical care events
produced by the I5.1 care-event boundary. Unknown facts stay unknown: instead of inventing a
count the result is `needs_input` with a structured missing-fact record naming exactly what is
missing. Task I5.3 was not started.

## files

Created:
- `packages/domain/src/wash-count.ts` — `countWashes`, strict Zod schemas (`WashCountRuleSchema`,
  `WashCountRangeSchema`, `WashCountResultSchema`, `WashCountUnitSchema`, `AsOfSchema`,
  `MissingFactSchema`, `EventReferenceSchema`) and exported TypeScript types.
- `tests/domain/wash-count.test.ts` — 45 tests covering all 40 required cases plus 5
  application-wash policy branch cases.

Modified:
- `vitest.config.ts` — added `packages/domain/src/wash-count.ts` to the per-file critical
  coverage list.
- `docs/product/requirement-traceability.md` — TR-01 Partial (named-unit counting evidence);
  TR-02, TR-03, TR-04 Partial (directly proven); TR-05..TR-08 Not started.
- `docs/product/full-product-capability-matrix.md` — TR-01..TR-04 rows updated with wash-count
  evidence; TR-05..TR-08 Not started.
- `.superpowers/sdd/2026-10-22-increment-5-wash-and-treatment-truth/progress.md` — I5.2 marked
  complete.

I5.1 trust boundary preserved: `wash-count.ts` imports `CareEvent` types directly from
`./care-events.ts`, does not touch `packages/domain/src/index.ts`, keeps `care-events.ts` absent
from the public barrel, does not weaken `expectedOwnerId`, and leaves the I5.4 authenticated
owner-scoped server join as a mandatory gate.

## public API

```
countWashes(
  events: readonly CareEvent[],
  rule: unknown,
  asOf: unknown
): WashCountResult
```

`WashCountResult` carries `unit`, `count` (non-negative integer when counted), `range`
(preserved exactly), `status` (`counted` | `needs_input`), `missing` (immutable structured
missing-fact records), `eventsUsed` (immutable references: `eventId`, `kind`, `date` only),
`application` (the treatment application event reference or null), and the evaluated `asOf`.

`WashCountRule` contains only: `ruleId`, `unit` (`wash | shampoo-session`), `applicationWashCounts`,
optional `applicationEventId` (selects one application when multiple are active), and optional
reviewed `range` (integer non-negative bounds, `minimum <= maximum`). Test fixtures only; no
production rule content is added.

## canonical counting rules (all verified by tests)

1. Counts only active canonical `wash` events.
2. Never counts planned guidance, viewed protocols, pending/skipped/substituted/modified steps,
   Cue Checks, notes/free text, Shelf ownership, catalogue claims, corrected audit rows, voided
   activities, or future events after `asOf`.
3. Counting starts from one exact active `application` event.
4. Events before the application are excluded.
5. The application wash is handled only by the rule's explicit `applicationWashCounts` policy.
6. `wash` and `shampoo-session` are distinct named units.
7. Multiple lathers during one recorded shampoo session count as one shampoo session (counted per
   wash event, not per lather).
8. Does not infer shampoo use from product category, product identity, the word "wash", or lather
   count alone.
9. A wash contributes to `shampoo-session` only when shampoo use is explicitly `yes`.
10. Explicit `no` does not count as a shampoo session.
11. `unknown` shampoo use produces `needs_input` when it could change the result.
12. Unknown or approximate event dates produce `needs_input` when the event cannot be placed
    reliably relative to the application or `asOf`.
13. Exact timestamps (offset-normalized) and day precision are compared safely.
14. Month/year precision is never widened to a specific day.
15. No wall-clock access; `asOf` is an explicit validated input.
16. Inputs are never mutated.
17. Output is deeply frozen.
18. Output is byte-deterministic for equivalent inputs in any input order.
19. Corrected and backdated active event sets recompute from the supplied canonical ledger.
20. No product-effectiveness or medical language appears in output.

## application-wash policy

The rule explicitly states whether the wash containing the treatment application counts. The
relationship is proven only by a shared confirmed execution/run identity (record id plus
recommendation run id), never by sharing a calendar day or by timestamp adjacency. Activity-recorded
applications carry no execution identity, so no wash can be proven to be their application wash; if
the relationship cannot be established and the policy could change the count, the result is
`needs_input` with an `application-wash-relationship-unknown` missing fact.

## missing facts

Structured missing-fact objects with stable codes and safe plain-language wording, covering:
missing treatment application, multiple treatment applications, application date unknown, wash date
unknown, date precision too coarse, event after `asOf` (code available), shampoo use unknown,
application-wash relationship unknown, invalid or unsupported event facts. No raw UUIDs, database
values, URLs, notes, rule internals or free text appear in user-facing wording. `needs_input`
returns `count: undefined` and never presents a partial count as final.

## genuine RED evidence

Before implementation, `packages/domain/src/wash-count.ts` was a stub that threw
`Error('countWashes is not implemented yet')`. Running `npx vitest run tests/domain/wash-count.test.ts`
produced 39 failed tests and 1 passing test (the passing test asserted the throw, so it passed for
the correct reason). Every failure occurred because `wash-count.ts` behavior was missing:
`Error: countWashes is not implemented yet` at `packages/domain/src/wash-count.ts:5`.

## focused GREEN totals

After implementation: `npx vitest run tests/domain/wash-count.test.ts` → 45 passed, 0 failed.
All 40 required cases plus 5 application-wash policy branch cases pass.

## full gate results (Node 24.19.0)

- `npm run check:runtime`: NODE-RUNTIME-PASS v24.19.0
- `npm run typecheck`: passed (domain and mobile)
- `npm run lint -- --max-warnings=0`: passed (0 warnings)
- `npm run test:coverage -- --maxWorkers=4`: passed; global 95.99 statements / 90.39 branches /
  98.19 functions / 97.82 lines
- `npm run export:web`: passed (exported dist)
- `npm run audit:control-plane`: METADATA-PASS, no findings
- `npm run audit:dependencies`: DEPENDENCY-POLICY-HOLD (critical 0, high 19, moderate 9) — reported
  as HOLD, not PASS; manifests and lockfiles were not altered
- `git diff --check`: clean (unstaged and staged)
- Scoped secret scan over changed files: no secrets found

## exact wash-count.ts coverage

Statements 92.74%, branches 85.56%, functions 93.75%, lines 93.04% — all above the 80% floor;
statements/functions/lines at or above 90%.

## review findings and resolutions

Independent reviews (code correctness/deterministic counting, security/privacy/trust boundary,
product truth/plain-language honesty): no Critical, High or Medium findings. Accepted Low findings:
none recorded. No regression fixes were required, so no re-review was triggered beyond the gate
run above. All gates pass.

## traceability changes

- TR-01: remains Partial, now with named-unit counting evidence from `wash-count.ts` and
  `wash-count.test.ts`.
- TR-02: Partial — two lathers in one wash count as one shampoo session; `wash` and
  `shampoo-session` are distinct named units.
- TR-03: Partial — application wash is not an elapsed wash after that application unless the rule
  explicitly counts it; same-day events are not assumed to be the same session.
- TR-04: Partial — optional reviewed manufacturer range preserved exactly; invalid/negative ranges
  rejected.
- TR-05 through TR-08: remain Not started.
- TL-04: remains Partial.
- Release milestone not promoted.

## dependency-audit result

DEPENDENCY-POLICY-HOLD: critical 0, high 19, moderate 9. Matches the expected ruling; this task did
not alter manifests or lockfiles.

## accepted Low findings

None.

## external and device gates not run

Hosted owner isolation, local Supabase live scenarios, real-database UI, device, TalkBack and
VoiceOver acceptance were not run (consistent with the task scope, which is domain-only and
pre-persistence).

## I5.3 status

Task I5.3 (treatment-programme state and due status) was not started. No persistence, APIs, mobile
UI, reminders, notifications, Heat Coach, photos, OCR, weather, Routine Audit, personal ranking,
learning, catalogue or guidance content was added.

## push/merge/deploy status

Nothing was pushed, merged, deployed or published. No hosted Supabase, Cloudflare or GitHub
settings were modified.

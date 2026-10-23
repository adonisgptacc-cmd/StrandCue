# Increment 5 progress

## Task I5.0 carry-over hardening: complete

- Forward migrations `20261024120000`, `20261024130000`, `20261024140000`: head-row guard, TRUNCATE guard, trusted-run check,
  advisory-lock replay convergence, `search_path` pinning of Cue Check definers and reachable helpers.
- Real two-session PostgreSQL proof (opt-in, loopback); nine Cue Check owner-isolation scenarios (51 total).
- Four isolated reviews plus re-reviews; fixes test-first. Gates: runtime, typecheck, lint, coverage (190 files / 4011 tests),
  web export, control-plane, research validation PASS; dependency audit HOLD (0/19/9) unchanged.
- NOT RUN: hosted isolation, local Supabase live scenarios, UI on a real database, device, TalkBack/VoiceOver.
- At the I5.0 stop point, TR-01..TR-08 stayed Not started. Report: `task-i5.0-report.md`.

## Task I5.1 canonical confirmed care-event ledger: complete

- Internal `deriveCareEvents` preserves confirmed wash, application and heat facts without inferring from plans, notes, Cue Checks, catalogue categories or deviations.
- Pending, skipped, substituted, modified, corrected and voided records do not become active occurrences. Confirmed non-care steps carry an explicit `none` classification.
- Activity occurrence identity and baseline date stay stable across later corrections; outputs are deterministic, immutable and canonically ordered.
- Sources require an authenticated-context owner match and exact execution/run classification binding. The raw module is absent from the public domain barrel; I5.4 must construct it through a reviewed owner-scoped server join.
- Focused tests: 46/46. Full coverage: 191 files passed, 5 skipped; 4057 tests passed, 22 skipped. `care-events.ts`: 95.16/89.28/100/95.88.
- Two independent final reviews found no Critical, High or Medium issues. TR-01 is Partial; TR-02..TR-08 remain Not started; TL-04 remains Partial.
- Report: `task-i5.1-report.md`. I5.2 not started.

## Task I5.2 wash counting by named unit: complete

- Pure `countWashes(events, rule, asOf)` counts only active canonical `wash` events after one confirmed treatment application, by named unit (`wash` | `shampoo-session`).
- Two lathers in one wash count as one shampoo session; the application wash is counted only when the rule explicitly says so; same-day events are not assumed to be the same session; shared confirmed run/session identity proves the application-wash relationship.
- Unknown facts produce `needs_input` with structured missing-fact records; manufacturer range preserved exactly; invalid/negative ranges rejected; future and non-wash events excluded.
- Strict Zod schemas, deeply frozen byte-deterministic output, no clock/network/database, no product-effectiveness or medical language, inputs never mutated.
- Focused tests: 45/45. `wash-count.ts` coverage: 92.74 statements / 85.56 branches / 93.75 functions / 93.04 lines (all above 80%).
- Independent code, security/privacy and product-truth reviews found no Critical, High or Medium findings.
- TR-01 Partial (named-unit counting evidence added); TR-02, TR-03, TR-04 Partial; TR-05..TR-08 Not started; TL-04 remains Partial.
- Dependency audit HOLD (0 critical, 19 high, 9 moderate). Nothing pushed, merged, deployed or published.

## Task I5.3 treatment-programme state and due status: complete

- Pure internal `evaluateProgramme(enrolment, events, rule, asOf)` combines owner-scoped enrolment facts, I5.1 canonical care events, I5.2 named-unit counting and an exact reviewed-rule publication binding.
- Exact product/version applications only; maintenance counts are derived at transition time; pause/resume chronology and pause-window exclusion fail closed; completed snapshots bind publication and canonical evidence.
- The module stays out of the public barrel. I5.4 must construct inputs and completion snapshots through an authenticated owner-scoped server join and must not accept authoritative client-built results.
- Focused tests: 102/102. Full coverage: 193 files passed / 5 skipped; 4204 tests passed / 22 skipped. `treatment-programme.ts`: 92.16 statements / 86.36 branches / 100 functions / 92.3 lines. Independent code and security/privacy re-reviews: approved with zero Critical, High or Medium findings.
- TR-05, TR-06, TR-07 and TR-08 move to Partial. Reviewed production treatment rules, persistence, mobile UI, hosted isolation and device evidence remain absent.
- Dependency audit remains HOLD unless its final command exits zero. Nothing pushed, merged, deployed or published.
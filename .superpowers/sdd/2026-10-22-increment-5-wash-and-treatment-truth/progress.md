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

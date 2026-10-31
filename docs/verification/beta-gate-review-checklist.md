# Beta gate review checklist

The review that flips HOLD. Quorum: founder, tech lead, QA. Each row needs
an owner, evidence attached (log, report or run output — never an assertion)
and a verdict. One open Sev-1 or one unevidenced row keeps HOLD.

## Entrance criteria (all must hold before the review convenes)

- [x] `docs/verification/beta-decisions.md`: all five decisions recorded with decider and date (D1–D4 DECIDED, D5 DEFERRED with date — 2026-09-23/24)
- [x] `npm run verify`: exit 0 on the release candidate commit (record the hash)
- [ ] Reconciliation matrix: no row contradicts current evidence
- [ ] No unresolved Critical or High findings in any lane review (security packet: F1 Low, F2 Medium-accepted pending owner circle — needs Alain sign-off)

## Per-gate evidence (attach, do not assert)

- [ ] Signed Android build on the internal track (build URL + track screenshot) — Plan A written, not executed
- [x] Real email verification + password recovery, cold and warm starts (device log) — PARTIAL: D3 delivery proven to Gmail (Resend EU, `delivered`); on-device cold/warm recovery pending Plan B/D device runs
- [ ] Authenticated RLS/API suite green against local Supabase (CI or run log)
- [x] Backup/restore rehearsal log showing RPO ≤1h and RTO ≤4h — PARTIAL: RTO 4s proven, restore correctness proven, tombstone reapply + RLS re-validation in log; RPO ≤1h NOT met (no PITR/schedule — F2)
- [x] Tombstone reapplication + RLS re-validation steps in the rehearsal log — evidenced 2026-09-24 (`{"reapplied": 0}`, 0 unprotected)
- [ ] Maestro flows green on the device matrix (run output) — Plan B written, not executed
- [ ] TalkBack, large-text, contrast and p95/poor-network notes (QA record) — Plan C written, not executed
- [ ] POPIA legal opinion attached — needs Marion Ado (Information Officer) + counsel
- [ ] Accessibility audit attached, zero critical findings open — Plan C review packet pending
- [ ] Penetration test attached, critical/high remediated — external, not commissioned
- [ ] Soft-launch cohort defined (≤50 invited users) with KPI review date

## Exit

- [ ] Verdict recorded here with date: HOLD or SOFT LAUNCH
- [ ] If SOFT LAUNCH: monitoring rota, rollback contact and 2–4 week KPI review date named

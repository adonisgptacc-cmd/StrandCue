# Beta gate review checklist

The review that flips HOLD. Quorum: founder, tech lead, QA. Each row needs
an owner, evidence attached (log, report or run output — never an assertion)
and a verdict. One open Sev-1 or one unevidenced row keeps HOLD.

## Entrance criteria (all must hold before the review convenes)

- [ ] `docs/verification/beta-decisions.md`: all five decisions recorded with decider and date
- [ ] `npm run verify`: exit 0 on the release candidate commit (record the hash)
- [ ] Reconciliation matrix: no row contradicts current evidence
- [ ] No unresolved Critical or High findings in any lane review

## Per-gate evidence (attach, do not assert)

- [ ] Signed Android build on the internal track (build URL + track screenshot)
- [ ] Real email verification + password recovery, cold and warm starts (device log)
- [ ] Authenticated RLS/API suite green against local Supabase (CI or run log)
- [ ] Backup/restore rehearsal log showing RPO ≤1h and RTO ≤4h
- [ ] Tombstone reapplication + RLS re-validation steps in the rehearsal log
- [ ] Maestro flows green on the device matrix (run output)
- [ ] TalkBack, large-text, contrast and p95/poor-network notes (QA record)
- [ ] POPIA legal opinion attached
- [ ] Accessibility audit attached, zero critical findings open
- [ ] Penetration test attached, critical/high remediated
- [ ] Soft-launch cohort defined (≤50 invited users) with KPI review date

## Exit

- [ ] Verdict recorded here with date: HOLD or SOFT LAUNCH
- [ ] If SOFT LAUNCH: monitoring rota, rollback contact and 2–4 week KPI review date named

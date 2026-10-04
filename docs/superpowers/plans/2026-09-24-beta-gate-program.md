# Beta Gate Program Plan

> **For agentic workers:** this plan coordinates human/provider/device work. Code tasks use checkbox syntax; human tasks are assigned by role.

**Goal:** Clear every `External gate` in `docs/verification/beta-readiness.md` with attached evidence, then hold the recorded gate review that flips HOLD → soft launch (50 invited users, 2–4 weeks per PRD §30.5).

**Workstreams (in dependency order):**

## A. Decisions (founder, days 0–7) — unblocks everything

Recorded in `docs/verification/beta-decisions.md`. All five start UNDECIDED:
1. Production Supabase project + region (drives residency, backups, cross-border assessment)
2. Owned HTTPS domain + final Android application identifier (deep links, sender domain, Play listing)
3. Transactional email provider + sender domain (SPF/DKIM/DMARC)
4. Named humans: Information Officer, support owner, security reviewer, verification operator
5. PostHog/Sentry hosting regions + subprocessors

- [ ] All five decided, dated and signed in `beta-decisions.md`

## B. Provider setup (tech lead, after A)

- [ ] Provision project, run trusted migrations in order, enable daily + hourly backups
- [ ] Configure SMTP + sender domain; verify deliverability to major ZA inboxes
- [ ] Run `scripts/backup-restore.sh rehearse` per `docs/runbooks/backup-restore-rehearsal.md`; attach log as RPO/RTO evidence
- [ ] Run authenticated RLS/API suite against local Supabase (needs Docker)
- [ ] EAS signed build → Play internal track (secrets from workstream A)

## C. Device evidence (QA, needs hardware + B)

- [ ] Real email verification + password recovery, cold and warm starts
- [ ] `.maestro/` flows on the internal-track build across the device matrix
- [ ] TalkBack, large-text, contrast check; p95 + poor-network measurements

## D. Independent reviews (external, parallel with B–C)

- [ ] POPIA legal opinion attached
- [ ] Accessibility audit attached
- [ ] Penetration test attached, findings remediated

## E. Gate review → soft launch

- [ ] Review against `docs/verification/beta-gate-review-checklist.md`
- [ ] Every readiness row Proven complete or explicitly removed from Phase 1
- [ ] Record outcome; flip HOLD; open soft launch (50 users, 2–4 weeks, KPI review)

## Non-blocking code threads (do not hold the gate)

- CSV export renderer, consent columns, mutation-testing scope.

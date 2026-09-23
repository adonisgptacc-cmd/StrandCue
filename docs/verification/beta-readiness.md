# Beta readiness — gate review record

Release status: **HOLD**

This matrix maps every rebaseline-design §4.5 beta requirement to current
evidence or a named external gate. `External gate` names its blocker type
(provider, device, owner, legal, human) so nothing can be mistaken for done.
Local evidence links to passing checks; anything unrun is a gate, not a pass.

## Status vocabulary

- **Proven complete:** Required implementation and current evidence pass through the required surface.
- **Implemented, unverified:** Implementation exists, but required API, device, security, or operational evidence is missing.
- **External gate:** Completion depends on a provider, device, named owner, legal review, or production configuration.

## Gate ledger

| Beta gate | Current classification | Evidence or named blocker |
|---|---|---|
| Signed Android build | External gate | EAS profiles and `android-build.yml` exist; signing keystore, Play Console access and internal-track distribution need a human release owner |
| Real email verification and password recovery | External gate | Recovery callback contracts, PKCE exchange and neutral messaging tested locally; real SMTP provider, sender domain and cold/warm device runs need a provider and devices |
| Fresh migration replay and authenticated API suite | Implemented, unverified | PGlite replay of the full trusted chain passes (`migration.test.ts`); hardening audit passes (`hardening.test.ts`); local Supabase replay and PostgREST suite need Docker (provider/device gate) |
| Backup and restore rehearsal | External gate | Rehearsal script corrected to RPO ≤1h/RTO ≤4h with tombstone and RLS steps (`rehearsal.test.ts`); live rehearsal needs a production Supabase project and Docker (provider gate) |
| Tombstone reapplication | Implemented, unverified | Restore-resurrection deletion proven in PGlite (`deletion.test.ts` reapply case); live-restore proof waits on the rehearsal above (provider gate) |
| Provider region and data residency | External gate | No production project selected; region, subprocessors, cross-border safeguards and retention settings need a founder decision plus provider (owner + provider gate) |
| Named operating owners | External gate | No Information Officer, support owner, security reviewer or verification operator designated (owner gate) |
| Independent reviews | External gate | POPIA legal opinion, accessibility audit and penetration test need external reviewers (legal + human gates) |
| Beta gate review | External gate | This HOLD changes only through a recorded review with all rows above Proven complete or explicitly removed from Phase 1 (human gate) |

## Promotion rule

A gate moves to **Proven complete** only with current, reproducible evidence
linked here. Provider responses, device runs and human sign-offs are
attached to the release decision, not asserted in advance.

## Review outcome — 24 September 2026

**Reviewer:** Muse Spark (opencode) — baseline review on `codex/repo-recovery`
**Date:** 2026-09-24
**Scope:** Quality + Beta lanes on top of the 23 September baseline gate

**Verification performed:**
- `git status --short` — clean (generated `dist` removed, ignored)
- `npm run verify` — exit 0 (39 files, 445 passed, coverage 91.82 stmts, METADATA-PASS, export smoke)
- `git diff --check` — no whitespace errors
- Security diff (`supabase`, `package.json`, mobile manifest): no service-role,
  secret, token or password material added; `sources/` untouched
- `tests/database/hardening.test.ts` — 5/5 (forced RLS, fixed search_path,
  anon isolation, mutator containment, no consumer direct writes)
- `tests/tooling/beta-readiness.test.ts` — 2/2 (named gates, HOLD, retired targets)

**Findings (all resolved before this record):**
- The hardening audit found 3 private cores retaining PostgreSQL PUBLIC
  default execute rights (shelf/tools list cores, `recent_auth`); closed in
  `20260924300000_function_grant_cleanup.sql`. Unexploitable (cores raise
  without JWT), now least-privilege.
- The final gate itself caught a follow-on break: the arity change in the
  pagination migration had created ungranted 2-arg overloads, which the
  cleanup then locked out entirely. Fixed in
  `20260924310000_list_core_grants.sql`, which also drops the orphaned
  1-arg overloads. This is the gate working as designed.
- The rehearsal script carried a typo, a retired 8-hour RTO and no restore,
  tombstone or RLS steps; corrected and contract-tested.

**No Critical or High findings remain open.** Release status stays **HOLD**
until provider, device and human gates clear with attached evidence.

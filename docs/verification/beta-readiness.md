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

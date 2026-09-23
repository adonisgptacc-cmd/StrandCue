# Phase 1 PRD-to-code reconciliation

Release status: **HOLD**

## Status vocabulary

- **Proven complete:** Required implementation and current evidence pass through the required surface.
- **Implemented, unverified:** Implementation exists, but required API, device, security, or operational evidence is missing.
- **Partial:** Only part of the product promise or invariant exists.
- **Missing:** No qualifying implementation exists in the trusted baseline.
- **Conflict:** Existing behavior or documentation contradicts the current authority.
- **External gate:** Completion depends on a provider, device, named owner, legal review, or production configuration.

## Capability ledger

| Capability | Current classification | Trusted implementation/evidence | Gap and owning follow-up plan |
|---|---|---|---|
| Authority and scope | Proven complete | Canonical PRD hash test; rebaseline design | Maintain through documentation tests |
| Authentication and recovery | Partial | Auth UI and callback contracts exist | Real email, cold/warm links, expiry/reuse, rate-limit and device evidence — Journey/Quality plans |
| Hair Passport | Implemented, unverified | Trusted migration, domain/database/mobile tests | Full device journey, accessibility and large-data evidence — Journey/Quality plans |
| Chemical Services | Implemented, unverified | Trusted migration, domain/database/mobile tests | Authenticated Supabase replay and device journey — Journey/Quality plans |
| My Shelf and provenance | Partial | Domain contracts and archived candidate SQL | Rebuild schema, immutable ownership, claim provenance, consumer UI and operator evidence — Shelf plan |
| My Tools | Partial | Domain contracts and archived candidate SQL | Rebuild schema, explicit unknowns, ownership/history and consumer UI — Tools plan |
| Activities and unified history | Partial | Domain contracts and archived candidate SQL; draft disposition | Build immutable RPC boundary, UI, drafts, duplicates, corrections/voids and history — Activity plan |
| Settings and consent | Partial | Unintegrated screens/contracts and archived candidate SQL | Promote through tested schema/RPC and integrate routed Settings journey — Journey plan |
| Export and portability | Partial | Unintegrated screen/contracts and archived candidate SQL | Rebuild job lifecycle, complete dataset, signed authorization, retention and device evidence — Journey plan |
| Deletion and restore enforcement | Partial | Unintegrated screen/contracts and archived candidate SQL | Rebuild lifecycle, session revocation, ordered purge, restore tombstones and device evidence — Journey/Beta plans |
| Security and RLS | Partial | Passport/Services owner-isolation tests | Review every promoted table/function, authenticated API suite and independent security review — every capability/Beta plan |
| UX and accessibility | Partial | Shared controls and selected label tests | Complete navigation, states, TalkBack, large text, contrast and external WCAG review — Journey/Quality plans |
| Analytics and observability | Missing | Consent contract only; no approved collection pipeline | Consent-gated PostHog allowlist, scrubbed Sentry, logs, dashboards and alerts — Quality plan |
| CI and automated quality | Partial | Local scripts and Vitest coverage threshold | GitHub Actions, dependency scanning, Maestro and mutation-test scope — Quality plan |
| Performance and resilience | Missing | No current representative-device or poor-network evidence | Pagination, fixtures, offline/conflict tests and p95 measurements — Journey/Quality plans |
| Backup and disaster recovery | External gate | Restore script and archived tombstone candidates are not proof | Provider backups and rehearsal proving RPO ≤1h/RTO ≤4h — Beta plan |
| POPIA and operating ownership | External gate | Product policy exists | Named officers/owners, retention validation, cross-border review and legal sign-off — Beta plan |
| Beta release evidence | External gate | EAS configuration and device-matrix drafts exist | Signed build, internal track, complete device/security/accessibility/operations evidence and gate review — Beta plan |

## Promotion rule

A capability moves to **Proven complete** only when its trusted implementation and all required evidence are linked in this document. A commit, archived migration, screen file, plan checkbox, or local-only test cannot independently establish completion.
